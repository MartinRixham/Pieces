define(["./Placeholder", "./Route"], function SlideNavPiece(Placeholder, Route) {

	var route = new Route();

	function SlideNavPiece(pages) {

		var self = this;

		var currentIndex = new Datum(0);

		var activeIndex = new Datum(-1);

		var container = null;

		var right = true;

		var slideRef = {};

		var routeIndex = -1;

		var updating = false;

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			element.style.overflow = "hidden";

			container = document.createElement("DIV");
			container.style.width = "200%";
			container.style.position = "relative";
			container.style.transition = "left 0.5s linear";
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

			var hidden = document.createElement("DIV");
			hidden.dataset.bind = "route";
			hidden.style.display = "none";

			element.appendChild(hidden);
			element.appendChild(container);
		};

		this.route = new Binding({

			init: function() {

				routeIndex =
					route.addRoute({

						set: function(route) {

							routePage(route);
						},
						get: function() {

							return pages[currentIndex()].route;
						}
					});
			},
			destroy: function() {

				route.remove(routeIndex);
			}
		});

		function routePage(hash) {

			if (updating) {

				updating = false;

				return;
			}

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					showPage(i);
					activeIndex(i);

					return;
				}
			}

			showPage(0);
			activeIndex(-1);
		}

		function showPage(index) {

			right = true;

			self.firstPage = pages[index].page;
			currentIndex(index);

			if (container) {

				container.style.removeProperty("transition");
				container.style.left = "0";
			}
		}

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			activeIndex(index);

			if ("#" + pages[index].route == location.hash) {

				return;
			}

			var ref = {};
			slideRef = ref;

			var oldPage;

			if (index > currentIndex()) {

				container.style.removeProperty("transition");
				container.style.left = "0";

				if (!right) {

					oldPage = getOldPage(1);

					this.firstPage = new Placeholder(oldPage);
				}

				this.secondPage = pages[index].page;

				right = false;

				setTimeout(function() {

					container.style.transition = "left 0.5s linear";
					container.style.left = "-100%";

					setTimeout(function() {

						if (slideRef == ref) {

							self.firstPage = null;
						}
					}, 500);
				});
			}
			else if (index < currentIndex()) {

				container.style.removeProperty("transition");
				container.style.left = "-100%";

				if (right) {

					oldPage = getOldPage(0);

					this.secondPage = new Placeholder(oldPage);
				}

				this.firstPage = pages[index].page;

				right = true;

				setTimeout(function() {

					container.style.transition = "left 0.5s linear";
					container.style.left = "0";

					setTimeout(function() {

						if (slideRef == ref) {

							self.secondPage = null;
						}
					}, 500);
				});
			}

			currentIndex(index);

			updating = true;

			route.update(routeIndex);
		};

		function getOldPage(index) {

			var children = container.children[index].children;
			var oldPage = new Array(children.length);

			for(var i = children.length - 1; i >= 0; i--) {

				oldPage[i] = children[i];
				container.children[index].removeChild(children[i]);
			}

			return oldPage;
		}

		this.firstPage = pages[0].page;

		this.secondPage = null;

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return SlideNavPiece;
});
