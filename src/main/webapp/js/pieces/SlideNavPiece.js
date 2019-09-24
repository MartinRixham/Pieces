define([
	"./Library",
	"./Placeholder",
	"./Route"
],
function SlideNavPiece(
	Library,
	Placeholder,
	Route) {

	var route = new Route();

	function SlideNavPiece(pages) {

		var self = this;

		var currentIndex = new Library.Datum(0);

		var activeIndex = new Library.Datum(-1);

		var container = null;

		var right = true;

		var slideRef = {};

		var routeIndex = -1;

		this.firstPage = pages[0].page;

		this.secondPage = null;

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			element.style.overflow = "hidden";
			element.style.paddingTop = "1px";

			container = document.createElement("DIV");
			container.style.width = "200%";
			container.style.position = "relative";
			container.style.left = "0";

			var firstElement = document.createElement("DIV");
			firstElement.dataset.bind = "firstPage";
			firstElement.style.display = "inline-block";
			firstElement.style.width = "50%";
			firstElement.style.verticalAlign = "top";

			var secondElement = document.createElement("DIV");
			secondElement.dataset.bind = "secondPage";
			secondElement.style.display = "inline-block";
			secondElement.style.width = "50%";

			container.appendChild(firstElement);
			container.appendChild(secondElement);

			element.appendChild(container);

			routeIndex =
				route.addRoute({

					set: function(word, routeIndex) {

						var changed = routePage(word);
						route.update(routeIndex);

						return changed;
					},
					get: function() {

						return pages[currentIndex()].route;
					}
				});
		};

		function routePage(hash) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					activeIndex(i);

					return showPage(i);
				}
			}

			activeIndex(-1);

			return showPage(0);
		}

		function showPage(index) {

			if (self.firstPage == pages[index].page) {

				return false;
			}

			right = true;

			self.firstPage = pages[index].page;
			self.secondPage = null;
			currentIndex(index);

			if (container) {

				container.style.removeProperty("transition");
				container.style.left = "0";
			}

			return true;
		}

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			activeIndex(index);

			var oldIndex = currentIndex();

			if (oldIndex != index) {

				route.changePage(routeIndex);
			}

			currentIndex(index);

			route.update(routeIndex);

			var ref = {};
			slideRef = ref;

			var oldPage;

			if (index > oldIndex) {

				container.style.removeProperty("transition");
				container.style.left = "0";

				if (!right) {

					oldPage = getOldPage(1);

					this.firstPage = new Placeholder(oldPage);
				}

				this.secondPage = pages[index].page;

				right = false;

				setTimeout(function() {

					container.style.transition = "left 0.5s ease-out";
					container.style.left = "-100%";

					setTimeout(function() {

						if (slideRef == ref) {

							self.firstPage = null;
						}
					}, 500);
				});
			}
			else if (index < oldIndex) {

				container.style.removeProperty("transition");
				container.style.left = "-100%";

				if (right) {

					oldPage = getOldPage(0);

					this.secondPage = new Placeholder(oldPage);
				}

				this.firstPage = pages[index].page;

				right = true;

				setTimeout(function() {

					container.style.transition = "left 0.5s ease-out";
					container.style.left = "0";

					setTimeout(function() {

						if (slideRef == ref) {

							self.secondPage = null;
						}
					}, 500);
				});
			}
		};

		function getOldPage(index) {

			var children = container.children[index].children;
			var oldPage = new Array(children.length);

			for (var i = children.length - 1; i >= 0; i--) {

				oldPage[i] = children[i];
				container.children[index].removeChild(children[i]);
			}

			return oldPage;
		}

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return SlideNavPiece;
});
