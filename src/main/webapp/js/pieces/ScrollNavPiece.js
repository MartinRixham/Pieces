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

	var moved = false;

	var scrolls = [];

	function scroll() {

		if (moved) {

			moved = false;

			return;
		}

		for (var i = 0; i < scrolls.length; i++) {

			scrolls[i]();
		}
	}

	addEventListener("scroll", scroll);

	function ScrollNavPiece(pages) {

		var route;

		var activeIndex = new Library.Datum(0);

		var currentIndex = -1;

		var container;

		var router;

		var subroute;

		this.pages = [];

		this.onBind = function(element) {

			var self = this;

			var event = document.createEvent("Event");
			event.initEvent("__PIECES_BIND__", true, true);
			element.dispatchEvent(event);

			route = Route.get();

			subroute = subroute ||
				new Subroute(
					route,
					function() { return currentIndex; },
					function(index) { self.showPage(index); });

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

			router =
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
				}, true);
		};

		function routePage(hash) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					scrollTo(i);

					activeIndex(i);
					currentIndex = i;
					subroute.setIndex(i);

					return;
				}
			}

			if (container.getBoundingClientRect().top < 50) {

				moved = true;

				scrollTo(0, 0);
			}

			activeIndex(0);
			currentIndex = -1;
			subroute.setIndex(0);
		}

		function scrollTo(index) {

			setTimeout(function() {

				var child = container.children[index];

				if (child) {

					moved = true;

					child.scrollIntoView();
				}
			}, 500);
		}

		this.hidden =
			new Library.Binding({

				init: function() {

					scrolls.push(scroll);
				},
				destroy: function() {

					scrolls.splice(scrolls.indexOf(scroll), 1);

					Route.set(route);
				}
			});

		function scroll() {

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

				router.update();
			}
		}

		this.showPage = function(index) {

			var child = container.children[index];

			if (child) {

				moved = true;

				child.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return ScrollNavPiece;
});
