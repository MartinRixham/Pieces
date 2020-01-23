define([
	"./Library",
	"./Route",
	"./Subroute",
	"./Page"
], function ScrollNavPiece(
	Library,
	Route,
	Subroute,
	Page) {

	var route;

	function ScrollNavPiece(pages) {

		var activeIndex = new Library.Datum(0);

		var currentIndex = -1;

		var container;

		var routeIndex = -1;

		var moved = false;

		var subroute;

		this.pages = [];

		function scroll() {

			if (moved) {

				moved = false;

				return;
			}

			var children = container.children;

			var index = 0;
			var bestTop = Number.MIN_SAFE_INTEGER;
			var found = false;

			for (var i = 0; i < children.length; i++) {

				var child = children[i];
				var top = child.getBoundingClientRect().top - 50;

				if (top <= 0 && top >= bestTop) {

					bestTop = top;
					index = i;
					found = true;
				}
			}

			var oldIndex = currentIndex;

			if (found) {

				currentIndex = index;
				subroute.setIndex(index);
			}
			else {

				currentIndex = -1;
				subroute.setIndex(0);
			}

			activeIndex(index);

			if (oldIndex != currentIndex) {

				route.update(routeIndex);
			}
		}

		this.onBind = function(element) {

			var event = document.createEvent("Event");
			event.initEvent("__PIECES_BIND__", true, true);
			element.dispatchEvent(event);

			route = Route.get();
			subroute = new Subroute(route);
			Route.set(subroute);

			this.pages = [];

			for (var i = 0; i < pages.length; i++) {

				this.pages.push(new Page(i, pages[i].page, subroute));
			}

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			element.style.paddingTop = "1px";

			var page = document.createElement("DIV");

			container = document.createElement("DIV");
			container.dataset.bind = "pages";
			container.appendChild(page);

			var hidden = document.createElement("DIV");
			hidden.dataset.bind = "hidden";
			hidden.style.display = "none";

			element.appendChild(container);
			element.appendChild(hidden);

			routeIndex =
				route.addRoute({

					set: function(word, routeIndex) {

						routePage(word);
						route.update(routeIndex);
					},
					get: function() {

						if (currentIndex >= 0) {

							return pages[currentIndex].route;
						}
						else {

							return "";
						}
					}
				});
		};

		function routePage(hash) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					var child = container.children[i];

					if (child) {

						moved = true;

						child.scrollIntoView();
					}

					activeIndex(i);
					currentIndex = i;
					subroute.setIndex(i);

					return;
				}
			}

			moved = true;

			if (container.getBoundingClientRect().top < 50) {

				window.scrollTo(0, 0);
			}

			activeIndex(0);
			currentIndex = -1;
			subroute.setIndex(0);
		}

		this.hidden =
			new Library.Binding({

				init: function() {

					window.addEventListener("scroll", scroll);
				},
				destroy: function() {

					Route.set(route);
					window.removeEventListener("scroll", scroll);
				}
			});

		this.showPage = function(index) {

			var child = container.children[index];

			if (child) {

				child.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return ScrollNavPiece;
});
